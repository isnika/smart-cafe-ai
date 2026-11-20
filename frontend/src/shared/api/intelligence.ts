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
import { http } from './http';

const AI = '/ai';
// API Gateway định tuyến chat tại /api/v1/chat/** (không có /intelligence/chat/**).
const CHAT = '/chat';

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
