import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-[#fff7ec] hover:opacity-95 active:translate-y-px border border-accent",
  secondary:
    "bg-paper-2 text-ink border border-ink-2 hover:bg-paper-3",
  ghost:
    "bg-transparent text-ink hover:bg-paper-2 border border-transparent hover:border-ink-3",
  danger:
    "bg-paper text-accent border border-accent hover:bg-accent-soft",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-3 py-1.5 rounded-md",
  md: "text-[15px] px-4 py-2 rounded-md",
  lg: "text-base px-5 py-2.5 rounded-md font-medium",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      iconLeft,
      iconRight,
      className = "",
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        className={`inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
        {...rest}
      >
        {iconLeft}
        {children}
        {iconRight}
      </button>
    );
  }
);
Button.displayName = "Button";
