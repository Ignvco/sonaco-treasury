import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
}

/** Premium card shell used across all treasury modules. */
export function SectionCard({
  title,
  subtitle,
  action,
  bodyClassName,
  className,
  children,
  ...props
}: SectionCardProps) {
  return (
    <section
      className={cn("t-card flex flex-col", className)}
      {...props}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
          <div className="min-w-0">
            {title && (
              <h3 className="text-[14px] font-semibold tracking-tight text-foreground">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("min-w-0 flex-1 px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}
