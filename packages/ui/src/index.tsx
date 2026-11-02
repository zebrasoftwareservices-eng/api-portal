// SPDX-License-Identifier: Apache-2.0
'use client';
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
export { AlertDialog, Dialog };
export { Toaster, toast } from 'sonner';
export function Button({
  asChild,
  variant = 'default',
  className = '',
  ...props
}: ComponentProps<'button'> & {
  asChild?: boolean;
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive' | 'link';
}) {
  const C = asChild ? Slot : 'button';
  return <C className={`button ${variant} ${className}`} {...props} />;
}
export function Input(props: ComponentProps<'input'>) {
  return <input {...props} />;
}
export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} />;
}
export function Label(props: ComponentProps<'label'>) {
  return <label {...props} />;
}
export function Card({ className = '', ...props }: ComponentProps<'div'>) {
  return <div className={`card ${className}`} {...props} />;
}
export function Badge(props: ComponentProps<'span'>) {
  return <span {...props} className={`badge ${props.className || ''}`} />;
}
export function Table(props: ComponentProps<'table'>) {
  return (
    <table {...props} className={`responsive-table ${props.className || ''}`} />
  );
}
export function Form(props: ComponentProps<'form'>) {
  return <form {...props} />;
}
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}) {
  return (
    <>
      <nav aria-label="Breadcrumb">
        {breadcrumb?.map((b, i) => (
          <span key={i}>
            {b.href ? <a href={b.href}>{b.label}</a> : b.label}
            {i < breadcrumb.length - 1 ? ' / ' : ''}
          </span>
        ))}
      </nav>
      <div className="page-header">
        <div>
          <h1 tabIndex={-1}>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </div>
        {actions && <div>{actions}</div>}
      </div>
    </>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="empty">
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {action}
    </Card>
  );
}
export function CopyButton({
  value,
  label = 'Copy',
  ariaLabel,
  onCopyError,
  autoFocus,
}: {
  value: string;
  label?: string;
  ariaLabel?: string;
  onCopyError?: () => void;
  autoFocus?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
          } catch {
            onCopyError?.();
          }
        }}
      >
        {copied ? '✓ Copied' : label}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${ariaLabel || 'API key'} copied.` : ''}
      </span>
    </>
  );
}
export function CodeValue({ value, label }: { value: string; label: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row">
        <code className="code-value" aria-label={label}>
          {value}
        </code>
        <CopyButton value={value} ariaLabel={`Copy ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}
export function KeyHint({ hint }: { hint: string }) {
  return <code aria-label={`Key ending in ${hint}`}>…{hint}</code>;
}
export function StatusBadge({ status }: { status: 'active' | 'revoked' }) {
  return (
    <Badge className={status}>
      {status === 'active' ? '● Active' : '○ Revoked'}
    </Badge>
  );
}
