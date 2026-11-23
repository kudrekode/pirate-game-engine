import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
	"inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent font-medium whitespace-nowrap text-xs leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45 [&>svg]:pointer-events-none [&>svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
				outline:
					"border-border bg-secondary text-foreground hover:border-input hover:bg-accent",
				secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
				ghost:
					"bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
				destructive:
					"border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/20",
			},
			size: {
				default: "h-7 px-2.5",
				sm: "h-6 px-2",
				xs: "h-6 px-2",
				icon: "size-7 p-0",
				"icon-sm": "size-6 p-0",
			},
		},
		defaultVariants: { variant: "outline", size: "default" },
	},
);

type ButtonProps = ComponentPropsWithoutRef<"button"> &
	VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	function Button(
		{ className, variant, size, asChild, type = "button", ...props },
		ref,
	) {
		const Component = asChild ? Slot : "button";
		return (
			<Component
				ref={ref}
				type={asChild ? undefined : type}
				data-slot="button"
				className={cn(buttonVariants({ variant, size }), className)}
				{...props}
			/>
		);
	},
);
