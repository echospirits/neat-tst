import type { MailAdapter, MailPage, MailSyncInput, MailChange } from "./types";
export class MockMailAdapter implements MailAdapter {
  constructor(private readonly changes: MailChange[] = []) {}
  async readPage(input: MailSyncInput): Promise<MailPage> {
    const offset = Number(input.cursor.offset || 0),
      changes = this.changes.slice(offset, offset + 20);
    return {
      changes,
      cursor: { offset: String(offset + changes.length) },
      more: offset + changes.length < this.changes.length,
    };
  }
}
