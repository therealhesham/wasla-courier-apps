import * as SecureStore from 'expo-secure-store';

const QUEUE_KEY = 'wasla_courier_offline_queue';

export type QueuedActionType = 'accept' | 'claim' | 'reject' | 'pickup' | 'onTheWay' | 'complete' | 'deliveryFailed';

export type QueuedAction = {
  id: string;
  type: QueuedActionType;
  orderId: string;
  // صاحب الإجراء — حتى لا يُرسَل إجراء سائق سابق بتوكن سائق آخر سجّل دخوله على نفس الجهاز.
  courierId?: string;
  payload?: Record<string, any>;
  createdAt: string;
};

// الحالة المحلية التي يُعرض بها الطلب طالما إجراؤه ينتظر بالطابور. null = الطلب يُخفى من القائمة (رفض).
const PENDING_STATUS_BY_TYPE: Record<QueuedActionType, string | null> = {
  accept: 'accepted',
  claim: null,
  reject: null,
  pickup: 'pickedUp',
  onTheWay: 'onTheWay',
  complete: 'delivered',
  deliveryFailed: 'deliveryFailed',
};

export function pendingStatusFor(type: QueuedActionType): string | null {
  return PENDING_STATUS_BY_TYPE[type] ?? null;
}

// يطبّق على قائمة الخادم الإجراءات التي ما زالت تنتظر بطابور المزامنة: الطلب الذي نفّذ السائق عليه
// إجراءً بلا اتصال يبقى ظاهرًا بحالته الجديدة (مع علامة "قيد المزامنة") بدل ما يرجع لحالته القديمة
// مع أول سحب ناجح قبل إرسال الإجراء، والطلب المرفوض يبقى مخفيًا. إجراءات سائق آخر تُتجاهل.
export function applyPendingQueue<T extends { id: string; status: string; pendingSync?: boolean }>(
  orders: T[],
  queue: QueuedAction[],
  courierId?: string,
): T[] {
  if (queue.length === 0) return orders;
  const hidden = new Set<string>();
  const pending = new Map<string, string>();
  for (const action of queue) {
    if (action.courierId && courierId && action.courierId !== courierId) continue;
    if (action.type === 'reject') {
      hidden.add(action.orderId);
      continue;
    }
    const status = pendingStatusFor(action.type);
    if (status) pending.set(action.orderId, status);
  }
  return orders
    .filter((item) => !hidden.has(item.id))
    .map((item) => {
      const status = pending.get(item.id);
      return status ? { ...item, status, pendingSync: true } : item;
    });
}

// كل عمليات القراءة ثم الكتابة على الطابور تمرّ بهذا القفل بالتسلسل. بدونه، عملية إضافة تحدث أثناء
// مزامنة جارية كانت تُمسح عند كتابة المزامنة لنسختها القديمة من الطابور.
let lockChain: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = lockChain.then(task, task);
  lockChain = run.catch(() => undefined);
  return run;
}

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await SecureStore.getItemAsync(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedAction[]): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

// يرمي خطأ إذا تعذّر الحفظ المحلي — حتى لا يظن السائق أن الإجراء محفوظ وسيُرسل لاحقًا وهو ضاع فعليًا.
export async function enqueueAction(action: Omit<QueuedAction, 'id' | 'createdAt'>): Promise<void> {
  const saved = await withLock(async () => {
    const queue = await readQueue();
    queue.push({
      ...action,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    });
    return writeQueue(queue);
  });
  if (!saved) {
    throw new Error('لا يوجد اتصال، وتعذّر حفظ الإجراء على الجهاز. أعد المحاولة عند عودة الاتصال.');
  }
}

export async function getQueue(): Promise<QueuedAction[]> {
  return withLock(readQueue);
}

export async function getQueueLength(): Promise<number> {
  return (await getQueue()).length;
}

async function removeAction(actionId: string): Promise<void> {
  await withLock(async () => {
    const queue = await readQueue();
    await writeQueue(queue.filter((item) => item.id !== actionId));
  });
}

export async function clearQueue(): Promise<void> {
  await withLock(async () => {
    await writeQueue([]);
  });
}

type FlushResult = { processed: number; remaining: number };

let activeFlush: Promise<FlushResult> | null = null;

// ينفّذ عناصر الطابور بالترتيب عبر executor الممرّر، ويزيل كل عنصر عند نجاحه. يتوقف عند أول فشل
// (يُفترض إن الاتصال لا يزال مقطوعًا) حتى لا تُنفَّذ العناصر التالية بترتيب غير صحيح على الخادم.
// مزامنة واحدة فقط تعمل في أي لحظة: أي استدعاء ثانٍ أثناءها ينتظر نفس النتيجة بدل ما يرسل نفس
// الإجراء للخادم مرتين.
export function flushQueue(executor: (action: QueuedAction) => Promise<boolean>): Promise<FlushResult> {
  if (activeFlush) return activeFlush;
  activeFlush = runFlush(executor).finally(() => {
    activeFlush = null;
  });
  return activeFlush;
}

async function runFlush(executor: (action: QueuedAction) => Promise<boolean>): Promise<FlushResult> {
  let processed = 0;
  const attempted = new Set<string>();

  while (true) {
    // نقرأ الطابور من جديد في كل دورة حتى نلتقط أي إجراء أُضيف أثناء تنفيذ الإجراء السابق.
    const queue = await getQueue();
    const next = queue[0];
    // إذا رجع نفس العنصر بعد تنفيذه فمعناه أن الحذف المحلي فشل — نتوقف بدل الدوران للأبد.
    if (!next || attempted.has(next.id)) break;
    attempted.add(next.id);

    let success = false;
    try {
      success = await executor(next);
    } catch {
      success = false;
    }
    if (!success) break;

    await removeAction(next.id);
    processed += 1;
  }

  return { processed, remaining: await getQueueLength() };
}

export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|fetch failed|failed to fetch|network error/i.test(message);
}
