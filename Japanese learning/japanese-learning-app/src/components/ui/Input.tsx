import * as React from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, className = "", ...rest }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-md border bg-paper px-3 py-2 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/50 ${
        invalid ? "border-accent" : "border-ink-3/60"
      } ${className}`}
      {...rest}
    />
  )
);
Input.displayName = "Input";
