import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { createElement as h } from 'react';
import { twMerge } from 'tailwind-merge';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'medium' | 'small' | 'xs';
};

const sizes = {
  medium: 'h-9 rounded-2lg p-2 text-body-medium',
  small: 'h-8 rounded-lg px-2 py-1.5 text-body-medium',
  xs: 'h-6 rounded-sm px-2 text-caption-1-semibold',
};
const variants = {
  primary: 'bg-button-primary text-text-white shadow-xs disabled:text-button-primary-disabled-foreground disabled:shadow-none',
  secondary: 'bg-background-primary-default text-text-primary border border-border-button-default shadow-xs hover:bg-background-primary-hover hover:border-border-button-hover active:bg-background-primary-active disabled:bg-background-primary-disabled disabled:text-text-tertiary disabled:shadow-none',
  ghost: 'bg-button-ghost-background text-button-ghost-foreground hover:bg-button-ghost-hover active:bg-button-ghost-active disabled:text-button-ghost-disabled-foreground',
  danger: 'bg-button-danger text-text-white shadow-xs disabled:text-foreground-disabled-danger disabled:shadow-none',
};

export function Button({ variant = 'primary', size = 'medium', children, className, type = 'button', ...props }: ButtonProps) {
  return h('button', {
    ...props, type,
    className: twMerge('inline-flex items-center justify-center gap-0.5 whitespace-nowrap overflow-hidden font-sans select-none cursor-pointer button-press-motion outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring disabled:cursor-not-allowed', sizes[size], variants[variant], className),
    'data-board-size': size, 'data-board-variant': variant,
  }, h('span', { className: 'inline-flex items-center justify-center px-1 shrink-0' }, children));
}

export function Badge({ color = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { color?: 'primary' | 'neutral' }) {
  return h('span', {
    ...props,
    'data-board-badge': color,
    className: twMerge('inline-flex items-center justify-center rounded-sm px-1 py-px text-caption-1-semibold tracking-normal whitespace-nowrap', color === 'primary' ? 'bg-accent-400 text-white' : 'bg-badge-neutral-background text-text-secondary', className),
  });
}
