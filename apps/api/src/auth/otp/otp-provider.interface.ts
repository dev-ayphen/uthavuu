export interface OtpProvider {
  send(phoneNumber: string, code: string): Promise<void>;
}
