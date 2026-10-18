import type {
  AIForecast,
  ChatMessage,
  ChatReply,
  ChatSession,
  CreateChatSessionInput,
  ListChatSessionsParams,
  ListForecastsParams,
  RecommendationView,
  SendChatMessageInput,
} from '@/shared/types';
import { http } from './http';

const P = '/intelligence';

// Forecast (Manager)
export const listForecasts = (params: ListForecastsParams) => http.get<AIForecast[]>(`${P}/forecasts`, { query: params });

// Recommendation
export const listRecommendations = (branchId?: number) =>
  http.get<RecommendationView[]>(`${P}/recommendations/me`, { query: { branchId } });
export const trackRecommendationClick = (id: number) => http.post<void>(`${P}/recommendations/${id}/click`);

// Chat – khách vãng lai dùng guestKey nên không bắt buộc token
export const createChatSession = (input: CreateChatSessionInput) =>
  http.post<ChatSession>(`${P}/chat/sessions`, input, { auth: false });
export const listChatMessages = (sessionId: number) =>
  http.get<ChatMessage[]>(`${P}/chat/sessions/${sessionId}/messages`, { auth: false });
/** Trả tin nhắn user vừa gửi + (nếu có) câu trả lời AI. */
export const sendChatMessage = (sessionId: number, input: SendChatMessageInput) =>
  http.post<ChatReply>(`${P}/chat/sessions/${sessionId}/messages`, input, { auth: false });
export const handOffChat = (sessionId: number) => http.post<ChatSession>(`${P}/chat/sessions/${sessionId}/handoff`, undefined, { auth: false });

// Staff inbox
export const listChatSessions = (params: ListChatSessionsParams = {}) =>
  http.get<ChatSession[]>(`${P}/chat/sessions`, { query: params });
export const claimChatSession = (sessionId: number) => http.post<ChatSession>(`${P}/chat/sessions/${sessionId}/claim`);
export const closeChatSession = (sessionId: number) => http.post<ChatSession>(`${P}/chat/sessions/${sessionId}/close`);