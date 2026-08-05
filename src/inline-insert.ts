import type { GroupMember, InlineInsertItem } from "./types.js";

export function buildInlineMentionItems(
  members: GroupMember[],
  query: string
): InlineInsertItem[] {
  const filter = query.trim().toLowerCase();
  return members.flatMap((member) => {
    const label = (member.card || member.nickname || member.userId)
      .replace(/^@+/, "")
      .trim() || member.userId;
    const searchable = [label, member.nickname, member.card, member.userId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (filter && !searchable.includes(filter)) return [];

    return [{
      type: "at" as const,
      id: `at:${member.userId}`,
      label,
      detail: member.userId,
      qq: member.userId,
    }];
  });
}
