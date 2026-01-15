/**
 * Email KSA - Knowledge, Skills, and Abilities
 *
 * Send emails via SendGrid. Supports:
 * - Plain text and HTML emails
 * - Multiple recipients (to, cc, bcc)
 * - Attachments
 * - Templates
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface EmailOptions {
  /** Recipient email address(es) */
  to: string | string[];
  /** Email subject */
  subject: string;
  /** Plain text body */
  text?: string;
  /** HTML body (alternative to text) */
  html?: string;
  /** CC recipients */
  cc?: string | string[];
  /** BCC recipients */
  bcc?: string | string[];
  /** Sender info (uses system default if not provided) */
  from?: {
    email: string;
    name?: string;
  };
  /** File attachments */
  attachments?: Array<{
    /** Base64-encoded content */
    content: string;
    /** Filename */
    filename: string;
    /** MIME type (e.g., 'application/pdf') */
    type?: string;
  }>;
  /** SendGrid template ID */
  templateId?: string;
  /** Dynamic data for template */
  templateData?: Record<string, any>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Send an email.
 *
 * @param options - Email options
 * @returns Send result
 *
 * @example
 * await send({
 *   to: 'user@example.com',
 *   subject: 'Hello from the agent',
 *   text: 'This is a test email sent by the AI agent.'
 * });
 */
export async function send(options: EmailOptions): Promise<EmailResult> {
  const payload: Record<string, any> = {
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    cc: options.cc,
    bcc: options.bcc,
    attachments: options.attachments,
    templateId: options.templateId,
    dynamicTemplateData: options.templateData,
  };

  if (options.from) {
    payload.from = options.from;
  }

  const data = await callGateway<any>("services.SendGrid.internal.send", payload);
  return {
    success: data.success !== false,
    messageId: data.messageId,
    error: data.error?.message,
  };
}

/**
 * Send a simple text email.
 *
 * @param to - Recipient email
 * @param subject - Email subject
 * @param body - Email body text
 * @returns Send result
 *
 * @example
 * await sendText('user@example.com', 'Task Complete', 'Your report is ready.');
 */
export async function sendText(
  to: string,
  subject: string,
  body: string
): Promise<EmailResult> {
  return send({ to, subject, text: body });
}

/**
 * Send an HTML email.
 *
 * @param to - Recipient email
 * @param subject - Email subject
 * @param html - HTML body
 * @returns Send result
 *
 * @example
 * await sendHtml('user@example.com', 'Report', '<h1>Monthly Report</h1><p>...</p>');
 */
export async function sendHtml(
  to: string,
  subject: string,
  html: string
): Promise<EmailResult> {
  return send({ to, subject, html });
}

/**
 * Send an email with an attachment.
 *
 * @param to - Recipient email
 * @param subject - Email subject
 * @param body - Email body
 * @param attachment - Attachment details
 * @returns Send result
 *
 * @example
 * import { read } from './ksa/file';
 *
 * // Read file as base64
 * const pdfContent = await read('/home/user/artifacts/report.pdf', { encoding: 'base64' });
 *
 * await sendWithAttachment(
 *   'user@example.com',
 *   'Your Report',
 *   'Please find the report attached.',
 *   {
 *     content: pdfContent,
 *     filename: 'report.pdf',
 *     type: 'application/pdf'
 *   }
 * );
 */
export async function sendWithAttachment(
  to: string,
  subject: string,
  body: string,
  attachment: {
    content: string;
    filename: string;
    type?: string;
  }
): Promise<EmailResult> {
  return send({
    to,
    subject,
    text: body,
    attachments: [attachment],
  });
}

/**
 * Send an email using a SendGrid template.
 *
 * @param to - Recipient email
 * @param templateId - SendGrid template ID
 * @param data - Dynamic template data
 * @param subject - Optional subject override
 * @returns Send result
 *
 * @example
 * await sendTemplate(
 *   'user@example.com',
 *   'd-abc123...',
 *   { name: 'John', orderNumber: '12345' }
 * );
 */
export async function sendTemplate(
  to: string,
  templateId: string,
  data: Record<string, any>,
  subject?: string
): Promise<EmailResult> {
  return send({
    to,
    subject: subject || "Message",
    templateId,
    templateData: data,
  });
}

/**
 * Send emails to multiple recipients.
 *
 * @param recipients - Array of recipient emails
 * @param subject - Email subject
 * @param body - Email body
 * @returns Send result
 *
 * @example
 * await sendBulk(
 *   ['user1@example.com', 'user2@example.com'],
 *   'Team Update',
 *   'Here is the weekly team update...'
 * );
 */
export async function sendBulk(
  recipients: string[],
  subject: string,
  body: string
): Promise<EmailResult> {
  return send({ to: recipients, subject, text: body });
}
