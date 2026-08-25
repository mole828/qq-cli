import type {
  GroupMember,
  InlineInsertItem,
  MentionLabelLookup,
} from "./types.js";

export function getGroupMemberLabel(member: GroupMember) {
  return (member.remark || member.card || member.nickname || member.userId)
    .replace(/^@+/, "")
    .trim() || member.userId;
}

export function buildMentionLabelLookup(
  members: readonly GroupMember[]
): MentionLabelLookup {
  return new Map(
    members.map((member) => [member.userId, getGroupMemberLabel(member)])
  );
}

export function buildInlineMentionItems(
  members: readonly GroupMember[],
  query: string
): InlineInsertItem[] {
  const filter = query.trim().toLowerCase();
  return members.flatMap((member) => {
    const label = getGroupMemberLabel(member);
    const searchable = [label, member.remark, member.nickname, member.card, member.userId]
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
