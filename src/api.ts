import * as SecureStore from 'expo-secure-store';
import { File, UploadType } from 'expo-file-system';

export const API_BASE_URL = 'http://72.60.95.121/api';

const TOKEN_KEY = 'wasla_courier_token';

export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

const ONBOARDING_KEY = 'wasla_courier_onboarding_seen';

export async function hasSeenOnboarding(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDING_KEY)) === '1';
}

export async function markOnboardingSeen() {
  await SecureStore.setItemAsync(ONBOARDING_KEY, '1');
}

export type WalletTransaction = {
  id: string;
  type: 'deposit' | 'withdrawal' | 'order_advance' | 'order_collection' | 'adjustment';
  amount: number;
  orderId?: string;
  orderNumber?: string;
  note?: string;
  createdAt: string;
};

export type StatementEntry = {
  date: string;
  type: 'cash_collected' | 'commission' | 'tip' | 'penalty' | 'settlement_payment';
  label: string;
  description: string;
  orderId?: string;
  orderNumber?: string;
  amount: number;
  runningBalance: number;
};

export type Statement = {
  courierId: string;
  courierName: string;
  openingBalance: number;
  closingBalance: number;
  entries: StatementEntry[];
};

export type PendingSettlement = {
  ordersCount: number;
  cashCollected: number;
  posCollected: number;
  totalCollected: number;
  commissionOwed: number;
  tipsOwed: number;
  penaltiesDeducted: number;
  netOwedToCourier: number;
  orders: {
    id: string;
    orderNumber?: string;
    customerName: string;
    paymentMethod?: string;
    collectedAmount: number;
    closedAt?: string;
    mealAmount: number;
    deliveryFee: number;
    tipAmount?: number;
    penalty?: { amount: number; reason?: string } | null;
  }[];
};

export type SettlementRecord = {
  id: string;
  ordersCount: number;
  cashCollected: number;
  posCollected: number;
  totalCollected: number;
  amountHandedOver: number;
  commissionOwed: number;
  tipsOwed: number;
  penaltiesDeducted: number;
  netOwedToCourier: number;
  notes?: string;
  settledBy?: string;
  createdAt: string;
};

export type ShiftBreak = {
  id: string;
  label: string;
  start: string;
  end: string;
  isPaid?: boolean;
};

export type WorkShift = {
  id: string;
  label: string;
  start: string;
  end: string;
  days: string[];
  isActive: boolean;
  breaks: ShiftBreak[];
};

export type ShiftStatus = {
  currentTime: string;
  weekday: string;
  isWithinShift: boolean;
  isOnBreak: boolean;
  canTakeOrders: boolean;
  activeShift: { id: string; label: string; start: string; end: string } | null;
  activeBreak: { id: string; label: string; start: string; end: string; isPaid?: boolean } | null;
};

export type CourierNoticeJustificationStatus = 'pending' | 'approved' | 'rejected';

export type CourierNotice = {
  id?: string;
  title: string;
  note?: string;
  relatedOrderId?: string;
  relatedOrderLabel?: string;
  rating?: number;
  category?: string;
  categoryId?: string;
  createdAt: string;
  justification?: string;
  justificationSubmittedAt?: string;
  justificationStatus?: CourierNoticeJustificationStatus;
  justificationDecisionAt?: string;
  justificationDecisionNote?: string;
};

export type Courier = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  vehicleType?: string;
  vehiclePlateNumber?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  area: string;
  isAvailable: boolean;
  isOnline?: boolean;
  operationalStatus?: 'available' | 'busy' | 'offline' | 'suspended';
  operationalStatusName?: string;
  walletBalance?: number;
  walletTransactions?: WalletTransaction[];
  shiftStart?: string;
  shiftEnd?: string;
  workShifts?: WorkShift[];
  shiftStatus?: ShiftStatus;
  warnings?: CourierNotice[];
  violations?: CourierNotice[];
  documents?: CourierDocumentItem[];
  complianceSuspended?: boolean;
  complianceSuspensionReason?: string | null;
  complianceExpiringSoonCount?: number;
};

export type CourierDocumentItem = {
  type: string;
  label: string;
  status: 'valid' | 'expiring_soon' | 'expired' | 'missing';
  requiresExpiry?: boolean;
  mandatory?: boolean;
  allowMultiple?: boolean;
  expiryDate?: string | null;
  daysLeft?: number | null;
};

export type Order = {
  id: string;
  orderNumber?: string;
  restaurantName: string;
  restaurantLatitude?: number;
  restaurantLongitude?: number;
  customerName: string;
  phone: string;
  area: string;
  address: string;
  customerLatitude?: number;
  customerLongitude?: number;
  mapLink?: string;
  mealAmount: number;
  deliveryFee: number;
  courierDistanceKm?: number;
  estimatedCourierArrivalMinutes?: number;
  collectedAmount?: number;
  paymentMethod?: string;
  paymentMethodName?: string;
  settlementMode?: 'customer_prepaid' | 'courier_advances' | 'courier_collects';
  status: string;
  statusName?: string;
  notes?: string;
  createdAt: string;
  assignedAt?: string;
  readyForPickupAt?: string;
  courierAcceptedAt?: string;
  pickedUpAt?: string;
  pickupProofUri?: string;
  onTheWayAt?: string;
  deliveredAt?: string;
  deliveryProofUri?: string;
  closedAt?: string;
  cancelReason?: string;
  cancelledAt?: string;
  deliveryFailedAt?: string;
  deliveryFailureReason?: string;
  deliveryFailureProofUri?: string;
  // حقل محلي بحت (لا يأتي من الخادم) — يشير إن آخر إجراء على هذا الطلب لم يصل للخادم بعد
  // بسبب انقطاع الاتصال، وينتظر في طابور المزامنة المحلي.
  pendingSync?: boolean;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(body?.message || 'حدث خطأ غير متوقع، حاول مرة أخرى.', response.status);
  }

  return body as T;
}

export async function loginCourier(identifier: string, password: string) {
  return request<{ token: string; courier: Courier }>('/mobile/courier/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

export async function fetchMe(token: string) {
  return request<Courier>('/mobile/courier/me', {}, token);
}

export async function fetchOrders(token: string) {
  return request<Order[]>('/mobile/courier/orders', {}, token);
}

export async function fetchAvailableOrders(token: string) {
  return request<Order[]>('/mobile/courier/orders/available', {}, token);
}

export async function claimOrder(token: string, orderId: string) {
  return request<Order>(`/mobile/courier/orders/${orderId}/claim`, { method: 'PATCH', body: '{}' }, token);
}

export type SupportMessage = {
  id: string;
  courierId: string;
  senderType: 'courier' | 'admin';
  senderName?: string;
  text: string;
  createdAt: string;
};

export async function fetchSupportMessages(token: string) {
  return request<SupportMessage[]>('/mobile/courier/support/messages', {}, token);
}

export async function sendSupportMessage(token: string, text: string) {
  return request<SupportMessage>('/mobile/courier/support/messages', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }, token);
}

export async function registerPushToken(token: string, expoPushToken: string) {
  return request<{ ok: boolean }>('/mobile/courier/push-token', {
    method: 'POST',
    body: JSON.stringify({ expoPushToken }),
  }, token);
}

export async function updateLocation(token: string, latitude: number, longitude: number) {
  return request<{ ok: boolean }>('/mobile/courier/location', {
    method: 'PATCH',
    body: JSON.stringify({ latitude, longitude }),
  }, token);
}

export async function fetchStatement(token: string, fromDays: number) {
  const from = new Date(Date.now() - fromDays * 24 * 60 * 60 * 1000).toISOString();
  return request<Statement>(`/mobile/courier/statement?from=${encodeURIComponent(from)}`, {}, token);
}

export async function fetchPendingSettlement(token: string) {
  return request<PendingSettlement>('/mobile/courier/pending-settlement', {}, token);
}

export async function fetchSettlementHistory(token: string) {
  return request<SettlementRecord[]>('/mobile/courier/settlement-history', {}, token);
}

export async function submitNoticeJustification(
  token: string,
  noticeType: 'warnings' | 'violations',
  noticeId: string,
  justification: string,
) {
  return request<CourierNotice>(
    `/mobile/courier/notices/${noticeType}/${noticeId}/justification`,
    { method: 'POST', body: JSON.stringify({ justification }) },
    token,
  );
}

export async function fetchOrder(token: string, orderId: string) {
  return request<Order>(`/mobile/courier/orders/${orderId}`, {}, token);
}

export async function setAvailability(token: string, isAvailable: boolean) {
  return request<Courier>('/mobile/courier/availability', {
    method: 'PATCH',
    body: JSON.stringify({ isAvailable }),
  }, token);
}

export type EmergencyType =
  | 'traffic_accident'
  | 'vehicle_breakdown'
  | 'fuel_out'
  | 'phone_malfunction'
  | 'medical_emergency'
  | 'security_issue'
  | 'other';

export async function reportEmergency(token: string, type: EmergencyType, note?: string) {
  return request<{ report: unknown; reassignedOrder: Order | null }>('/mobile/courier/emergency', {
    method: 'POST',
    body: JSON.stringify({ type, note }),
  }, token);
}

export async function acceptOrder(token: string, orderId: string) {
  return request<Order>(`/mobile/courier/orders/${orderId}/accept`, { method: 'PATCH', body: '{}' }, token);
}

export async function rejectOrder(token: string, orderId: string) {
  return request<Order>(`/mobile/courier/orders/${orderId}/reject`, { method: 'PATCH', body: '{}' }, token);
}

export async function pickupOrder(token: string, orderId: string, proofUri: string) {
  return request<Order>(`/mobile/courier/orders/${orderId}/pickup`, {
    method: 'PATCH',
    body: JSON.stringify({ proofUri }),
  }, token);
}

export async function markOnTheWay(token: string, orderId: string) {
  return request<Order>(`/mobile/courier/orders/${orderId}/on-the-way`, { method: 'PATCH', body: '{}' }, token);
}

export async function markDeliveryFailed(token: string, orderId: string, reason: string, proofUri: string) {
  return request<Order>(`/mobile/courier/orders/${orderId}/delivery-failed`, {
    method: 'PATCH',
    body: JSON.stringify({ reason, proofUri }),
  }, token);
}

export async function completeDelivery(
  token: string,
  orderId: string,
  input: { proofUri: string; collectedAmount: number; paymentMethod: 'cash' | 'pos' },
) {
  return request<Order>(`/mobile/courier/orders/${orderId}/complete`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, token);
}

export async function uploadPhoto(token: string, localUri: string): Promise<string> {
  const filename = localUri.split('/').pop() || 'photo.jpg';
  const extensionMatch = /\.(\w+)$/.exec(filename);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg';
  const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';

  // نستخدم File.upload بدل fetch+FormData لأن React Native الحديث (New Architecture) يرمي
  // "Unsupported FormData part implementation" عند إرفاق ملف بهذه الطريقة القديمة.
  const file = new File(localUri);
  const result = await file.upload(`${API_BASE_URL}/mobile/courier/upload-photo`, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    headers: { Authorization: `Bearer ${token}` },
  });

  let body: any = null;
  try {
    body = JSON.parse(result.body || '{}');
  } catch {
    body = null;
  }

  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(body?.message || 'تعذر رفع الصورة.', result.status);
  }

  return body.url as string;
}
