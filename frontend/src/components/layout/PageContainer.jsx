import { forwardRef } from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

const containerWidths = {
  content: "max-w-content",
  reading: "max-w-reading",
  verse: "max-w-verse",
  full: "max-w-none",
};

const PageContainer = forwardRef(function PageContainer(
  { as: Component = "div", size = "content", className = "", children, ...props },
  ref,
) {
  const width = Object.hasOwn(containerWidths, size)
    ? containerWidths[size]
    : containerWidths.content;

  return (
    <Component
      {...props}
      ref={ref}
      className={twMerge(clsx(
        "mx-auto w-full min-w-0 px-4 sm:px-6 lg:px-8",
        width,
        className,
      ))}
    >
      {children}
    </Component>
  );
});

export default PageContainer;
