// Matches apps/api/src/support/* — Profile → Help & Support / Submit Ticket.
import { apiRequest } from '../lib/api';

export type Ticket = {
  id: string;
  subject: string;
  description: string;
  createdAt: string;
  category: { key: string; label: string };
  status: { key: string; label: string };
};

export type CreateTicketInput = {
  categoryKey: string;
  subject: string;
  description: string;
};

export function createTicket(input: CreateTicketInput): Promise<Ticket> {
  return apiRequest('/support/tickets', { method: 'POST', auth: true, body: input });
}

export function listMyTickets(): Promise<Ticket[]> {
  return apiRequest('/users/me/tickets', { method: 'GET', auth: true });
}
