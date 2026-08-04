export type AccountWorkspaceSection = {
  href: string;
  label: string;
};

export function AccountWorkspaceNavigation({ sections }: { sections: AccountWorkspaceSection[] }) {
  return (
    <nav aria-label="Account workspace" className="account-workspace-nav">
      {sections.map((section) => (
        <a href={section.href} key={section.href}>{section.label}</a>
      ))}
    </nav>
  );
}
