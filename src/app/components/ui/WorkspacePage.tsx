import type { ReactNode } from 'react';
import { AeroIcon, type AeroIconName } from './AeroIcon';

/** Shared DIS chrome; each screen retains its own domain-specific workspace. */
export function WorkspacePageHeader({
  title,
  icon,
  children,
}: {
  title: string;
  icon: AeroIconName;
  children?: ReactNode;
}) {
  return (
    <header className="workspace-page-caption">
      <AeroIcon name={icon} />
      <h2 title={title}>{title}</h2>
      {children && <div className="workspace-page-caption-details">{children}</div>}
    </header>
  );
}

export function WorkspacePage({
  title,
  icon,
  toolbar,
  children,
  scroll = true,
  headerDetails,
  className = '',
}: {
  title: string;
  icon: AeroIconName;
  toolbar?: ReactNode;
  children?: ReactNode;
  scroll?: boolean;
  headerDetails?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`workspace-page ${className}`}>
      <WorkspacePageHeader title={title} icon={icon}>
        {headerDetails}
      </WorkspacePageHeader>
      <div className="workspace-page-toolbar">{toolbar}</div>
      <div className={`workspace-page-body ${scroll ? 'is-scrollable' : 'is-split'}`}>
        {children}
      </div>
    </section>
  );
}
