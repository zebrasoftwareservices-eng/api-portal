// SPDX-License-Identifier: Apache-2.0
'use client';
import {
  useId,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
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
  titleSuffix,
}: {
  title: string;
  titleSuffix?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}) {
  return (
    <>
      {!!breadcrumb?.length && (
        <nav aria-label="Breadcrumb">
          {breadcrumb?.map((b, i) => (
            <span key={i}>
              {b.href ? <a href={b.href}>{b.label}</a> : b.label}
              {i < breadcrumb.length - 1 ? ' / ' : ''}
            </span>
          ))}
        </nav>
      )}
      <div className="page-header">
        <div>
          <div className="reference-title">
            <h1 tabIndex={-1}>{title}</h1>
            {titleSuffix}
          </div>
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
  titleSuffix?: ReactNode;
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
  copiedMessage,
  autoFocus,
  announce,
  failedMessage = "Couldn't copy. Select the text and press Ctrl+C (⌘C on Mac).",
  onFailed,
}: {
  value: string;
  label?: string;
  ariaLabel?: string;
  onCopyError?: () => void;
  copiedMessage?: string;
  autoFocus?: boolean;
  announce?: string;
  failedMessage?: string;
  onFailed?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
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
          setFailed(false);
          setCopied(false);
          clearTimeout(timer.current);
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
          } catch {
            setFailed(true);
            onCopyError?.();
            onFailed?.();
          }
        }}
      >
        {copied ? '✓ Copied' : label}
      </Button>
      <span
        className={
          failed
            ? 'copy-feedback error-text'
            : announce && copied
              ? 'copy-feedback muted'
              : 'sr-only'
        }
        aria-live="polite"
        aria-atomic="true"
      >
        {failed
          ? failedMessage
          : copied
            ? announce || copiedMessage || 'Copied.'
            : ''}
      </span>
    </>
  );
}
export function CodeValue({ value, label }: { value: string; label: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row code-row">
        <code className="code-value" aria-label={label}>
          {value}
        </code>
        <CopyButton
          value={value}
          ariaLabel={`Copy ${label.toLowerCase()}`}
          copiedMessage={`${label} copied.`}
        />
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

export function PasswordInput(props: ComponentProps<'input'>) {
  const [show, setShow] = useState(false);
  const generated = useId();
  const id = props.id || generated;
  return (
    <div className="row">
      <Input {...props} id={id} type={show ? 'text' : 'password'} />
      <Button
        type="button"
        variant="ghost"
        aria-controls={id}
        aria-pressed={show}
        onClick={() => setShow(!show)}
      >
        {show ? 'Hide' : 'Show'}
      </Button>
    </div>
  );
}
export function Switch(props: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      {...props}
      className={`switch ${props.className || ''}`}
    >
      <SwitchPrimitive.Thumb className="switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
export { VersionSwitcher } from './version-switcher';
export * as DropdownMenu from '@radix-ui/react-dropdown-menu';
