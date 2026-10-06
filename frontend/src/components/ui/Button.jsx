import { forwardRef } from "react";
import PropTypes from "prop-types";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

const buttonStyles = {
  base: `
    inline-flex items-center justify-center gap-2 tracking-widest font-bold textshade
    rounded-soft font-sans font-medium border-0
    transition-[color,background-color,border-color,transform] duration-200 ease-editorial
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest
    focus-visible:ring-offset-2 focus-visible:ring-offset-ivory
    disabled:pointer-events-none disabled:opacity-50
    enabled:active:scale-[0.98] tracking-wide
    motion-reduce:transition-none motion-reduce:transform-none
    select-none
  `,

  variants: {
    primary:
      "bg-forest text-white uppercase hover:bg-forest-deep",

    secondary:
      "border border-forest bg-transparent text-forest hover:bg-parchment",

    ghost:
      "bg-transparent text-forest hover:bg-parchment",

    text:
      "bg-transparent text-forest font-normal tracking-normal underline-offset-4 decoration-bronze hover:text-forest-deep hover:underline",

    icon: "bg-transparent text-forest hover:bg-parchment",

    destructive:
      "bg-red-800 text-white hover:bg-red-900 focus-visible:ring-red-800",
  },

  sizes: {
    xs: "h-6 px-3 text-[8px]",
    sm: "h-7 px-4 text-[11px]",
    md: "h-8 px-5 text-[13px]",
    lg: "h-12 px-6 text-lg",
    xl: "h-18 px-18 text-sm",

    icon: "h-10 w-10 p-0",
  },
};

const Spinner = () => (
  <svg
    className="h-4 w-4 shrink-0 border-0 animate-spin motion-reduce:animate-none"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />

    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
    />
  </svg>
);

const Button = forwardRef(
  (
    {
      children,
      variant = "primary",
      size = variant === "icon" ? "icon" : "md",

      type = "button",

      disabled = false,
      loading = false,

      fullWidth = false,

      leftIcon,
      rightIcon,

      className = "",

      ...props
    },
    ref,
  ) => {
    const selectedVariant = Object.hasOwn(buttonStyles.variants, variant)
      ? variant
      : "primary";
    const selectedSize = Object.hasOwn(buttonStyles.sizes, size) ? size : "md";
    const trailingIcon = rightIcon === undefined && selectedVariant === "primary"
      ? "→"
      : rightIcon;

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={twMerge(clsx(
          buttonStyles.base,
          buttonStyles.sizes[selectedSize],
          buttonStyles.variants[selectedVariant],
          selectedVariant === "text" && "h-auto rounded-none px-0 py-0",
          fullWidth && "w-full",
          className,
        ))}
      >
        {loading ? (
          <>
            <Spinner />
            <span className={selectedVariant === "icon" ? "sr-only border-0" : "border-0"}>
              Loading...
            </span>
          </>
        ) : (
          <>
            {leftIcon && <span className="inline-flex shrink-0 border-0" aria-hidden="true">{leftIcon}</span>}

            {children}

            {trailingIcon && <span className="inline-flex  shrink-0 border-0" aria-hidden="true">
              {trailingIcon}
              </span>}
          </>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";

Button.propTypes = {
  children: PropTypes.node.isRequired,

  variant: PropTypes.oneOf([
    "primary",
    "secondary",
    "ghost",
    "text",
    "icon",
    "destructive",
  ]),

  size: PropTypes.oneOf(["xs", "sm", "md", "lg", "xl", "icon"]),

  type: PropTypes.oneOf(["button", "submit", "reset"]),

  disabled: PropTypes.bool,

  loading: PropTypes.bool,

  fullWidth: PropTypes.bool,

  leftIcon: PropTypes.node,

  rightIcon: PropTypes.node,

  className: PropTypes.string,

  onClick: PropTypes.func,
};

export default Button;
