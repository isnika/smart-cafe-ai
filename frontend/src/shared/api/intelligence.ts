import type {
  AIForecast,
  ChatMessage,
  ChatReply,
  ChatSession,
  CreateChatSessionInput,
  ListChatSessionsParams,
  ListForecastsParams,
  SendChatMessageInput,
} from '@/shared/types';
import { normalizeTimestamps, toCamelKeys } from '@/shared/lib';
import { http, isApiError } from './http';

const AI = '/ai';
const AI_DIRECT = '/ai-service';
// API Gateway định tuyến chat tại /api/v1/chat/** (không có /intelligence/chat/**).
const CHAT = '/chat';
const canFallbackToAiService = (error: unknown) =>
  isApiError(error) && (error.status === 403 || error.status === 404 || error.status === 503 || error.status === 504 || error.status === 0);

export interface ChatCompletionRequest {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ChatCompletionResponse {
  answer: string;
  sources: Array<{
    source: string;
    category: string;
    heading: string;
    score: number;
    content: string;
  }>;
}

export interface AIRecommendationRequest {
  mode: 'personalized' | 'similar';
  productId?: number;
  topK: number;
}

export interface AIRecommendationItem {
  productId: number;
  name: string;
  category?: string | null;
  priceVnd?: number | null;
  image?: string | null;
  score?: number | null;
  reasonCode?: string | null;
  reason?: string | null;
}

export interface AIRecommendationResponse {
  userId?: string | null;
  branchId: number;
  strategy: string;
  fallbackReason?: string | null;
  modelVersion: string;
  recommendations: AIRecommendationItem[];
}

export interface RevenueForecastRequest {
  startDate: string;
  days: number;
  branchId: number;
}

export interface RevenueForecastResponse {
  branchId: number;
  model: string;
  modelVersion: string;
  metadata?: Record<string, unknown> | null;
  forecast: Array<{ date: string; predictedRevenueVnd: number }>;
}

export interface TargetDateForecastRequest {
  targetDate: string;
  branchId: number;
}

export interface InventoryForecastResponse {
  targetDate: string;
  branchId: number;
  ingredients: Array<{
    ingredientId: number;
    ingredientName: string;
    unit: string;
    forecastUsage?: number | null;
    recommendedPurchase?: number | null;
    status: 'ok' | 'insufficient_data';
  }>;
}

export interface ProductForecastResponse {
  targetDate: string;
  branchId: number;
  products: Array<{
    productId: number;
    variantId: number | null;
    productName: string;
    predictedQuantity: number;
    recommendedQuantity: number;
    fallbackReason?: string | null;
  }>;
}

const decodeAiResponse = <T>(payload: unknown): T =>
  normalizeTimestamps(toCamelKeys<T>(payload));

/** Gọi chatbot AI qua Spring Intelligence Service, kèm ngữ cảnh chi nhánh và token nếu có. */
export async function completeChat(input: ChatCompletionRequest, branchId: number) {
  const options = { headers: { 'X-Branch-Id': String(branchId) } };
  try {
    return await http.post<ChatCompletionResponse>(CHAT, input, options);
  } catch (error) {
    if (!canFallbackToAiService(error)) throw error;
    return http.post<ChatCompletionResponse>(`${AI_DIRECT}/chat`, input, { ...options, baseUrl: '' });
  }
}

/** Cá nhân hoá theo JWT hiện tại; không nhận userId từ trình duyệt. */
export async function getRecommendations(input: AIRecommendationRequest, branchId: number) {
  const options = {
    headers: { 'X-Branch-Id': String(branchId) },
    snake: true,
  };
  let payload: unknown;
  try {
    payload = await http.post<unknown>(`${AI}/recommendation`, input, options);
  } catch (error) {
    if (!canFallbackToAiService(error)) throw error;
    payload = await http.post<unknown>(`${AI_DIRECT}/api/recommendation`, input, { ...options, baseUrl: '' });
  }
  return decodeAiResponse<AIRecommendationResponse>(payload);
}

export async function forecastRevenue(input: RevenueForecastRequest) {
  let payload: unknown;
  try {
    payload = await http.post<unknown>(`${AI}/forecasting`, input, { snake: true });
  } catch (error) {
    if (!canFallbackToAiService(error)) throw error;
    payload = await http.post<unknown>(`${AI_DIRECT}/api/forecasting`, input, { snake: true, baseUrl: '' });
  }
  return decodeAiResponse<RevenueForecastResponse>(payload);
}

export async function forecastInventory(input: TargetDateForecastRequest) {
  let payload: unknown;
  try {
    payload = await http.post<unknown>(`${AI}/forecasting/inventory`, input, { snake: true });
  } catch (error) {
    if (!canFallbackToAiService(error)) throw error;
    payload = await http.post<unknown>(`${AI_DIRECT}/api/forecasting/inventory`, input, { snake: true, baseUrl: '' });
  }
  return decodeAiResponse<InventoryForecastResponse>(payload);
}

export async function forecastProducts(input: TargetDateForecastRequest) {
  let payload: unknown;
  try {
    payload = await http.post<unknown>(`${AI}/forecasting/products`, input, { snake: true });
  } catch (error) {
    if (!canFallbackToAiService(error)) throw error;
    payload = await http.post<unknown>(`${AI_DIRECT}/api/forecasting/products`, input, { snake: true, baseUrl: '' });
  }
  return decodeAiResponse<ProductForecastResponse>(payload);
}

// Forecast (Manager)
export const listForecasts = (params: ListForecastsParams) => http.get<AIForecast[]>(`${AI}/forecasts`, { query: params });

// Chat – khách vãng lai dùng guestKey nên không bắt buộc token
export const createChatSession = (input: CreateChatSessionInput) =>
  http.post<ChatSession>(`${CHAT}/sessions`, input, { auth: false });
export const listChatMessages = (sessionId: number) =>
  http.get<ChatMessage[]>(`${CHAT}/sessions/${sessionId}/messages`, { auth: false });
/** Trả tin nhắn user vừa gửi + (nếu có) câu trả lời AI. */
export const sendChatMessage = (sessionId: number, input: SendChatMessageInput) =>
  http.post<ChatReply>(`${CHAT}/sessions/${sessionId}/messages`, input, { auth: false });
export const handOffChat = (sessionId: number) => http.post<ChatSession>(`${CHAT}/sessions/${sessionId}/handoff`, undefined, { auth: false });

// Staff inbox
export const listChatSessions = (params: ListChatSessionsParams = {}) =>
  http.get<ChatSession[]>(`${CHAT}/sessions`, { query: params });
export const claimChatSession = (sessionId: number) => http.post<ChatSession>(`${CHAT}/sessions/${sessionId}/claim`);
export const closeChatSession = (sessionId: number) => http.post<ChatSession>(`${CHAT}/sessions/${sessionId}/close`);
export const sendStaffChatMessage = (sessionId: number, input: SendChatMessageInput) =>
  http.post<ChatReply>(`${CHAT}/sessions/${sessionId}/messages/staff`, input);
