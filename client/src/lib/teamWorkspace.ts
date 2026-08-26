export function getTeamWorkspaceSummary(members: Array<{ active: boolean; role: string }>) {
  const active = members.filter(member => member.active).length;
  const admins = members.filter(member => member.active && (member.role === "owner" || member.role === "admin")).length;
  return { active, inactive: members.length - active, admins };
}
