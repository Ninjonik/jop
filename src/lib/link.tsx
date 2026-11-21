import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { useToolNavigation } from './navigation';
export default function AppLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, 'to'> & { href: string }) {
  const tool = useToolNavigation();
  return (
    <Link
      to={href}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (
          tool &&
          href.startsWith('/') &&
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          !props.target
        ) {
          event.preventDefault();
          tool.navigate(href);
        }
      }}
    />
  );
}
