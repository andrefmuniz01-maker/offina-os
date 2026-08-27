import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { useLocation } from "wouter";
import { withDemoContext } from "@/lib/demoWorkspace";

type AnchorProps = ComponentProps<"a">;

export function SafeLink({ href, children }: { href: string; children: ReactNode }) {
  const [, navigate] = useLocation();
  if (!isValidElement(children)) return null;
  const child = children as ReactElement<AnchorProps>;
  const targetHref = withDemoContext(href);
  return cloneElement(child, {
    href: targetHref,
    onClick: event => {
      child.props.onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(targetHref);
    },
  });
}
