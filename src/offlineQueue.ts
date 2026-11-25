import * as SecureStore from 'expo-secure-store';

const QUEUE_KEY = 'wasla_courier_offline_queue';

export type QueuedActionType = 'accept' | 'claim' | 'reject' | 'pickup' | 'onTheWay' | 'complete' | 'deliveryFailed';

export type QueuedAction = {
  id: string;
  type: QueuedActionType;
  orderId: string;
  payload?: Record<string, any>;
  createdAt: string;
};

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await SecureStore.getItemAsync(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedAction[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // تجاهل فشل الحفظ المحلي — أفضل من كسر تدفق التطبيق
  }
}

export async function enqueueAction(action: Omit<QueuedAction, 'id' | 'createdAt'>): Promise<void> {
  const queue = await readQueue();
  queue.push({
    ...action,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  await writeQueue(queue);
}

export async function getQueue(): Promise<QueuedAction[]> {
  return readQueue();
}

export async function getQueueLength(): Promise<number> {
  return (await readQueue()).length;
}

// ينفّذ عناصر الطابور بالترتيب عبر executor الممرّر، ويزيل كل عنصر عند نجاحه. يتوقف عند أول فشل
// (يُفترض إن الاتصال لا يزال مقطوعًا) حتى لا تُنفَّذ العناصر التالية بترتيب غير صحيح على الخادم.
export async function flushQueue(
  executor: (action: QueuedAction) => Promise<boolean>,
): Promise<{ processed: number; remaining: number }> {
  let queue = await readQueue();
  let processed = 0;

  while (queue.length > 0) {
    const [next, ...rest] = queue;
    let success = false;
    try {
      success = await executor(next);
    } catch {
      success = false;
    }
    if (!success) break;
    queue = rest;
    processed += 1;
    await writeQueue(queue);
  }

  return { processed, remaining: queue.length };
}

export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|fetch failed|failed to fetch|network error/i.test(message);
}
