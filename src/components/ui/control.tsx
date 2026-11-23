import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "@/lib/utils";

export { Button } from "./button";

const field =
	"min-w-0 w-full rounded-md border border-input bg-field px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground aria-invalid:border-destructive focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<
	HTMLInputElement,
	ComponentPropsWithoutRef<"input">
>(function Input({ className, type, ...props }, ref) {
	const compact = type === "checkbox" || type === "radio";
	return (
		<input
			ref={ref}
			type={type}
			data-slot="input"
			className={cn(
				compact ? "size-3.5 shrink-0 accent-primary" : field,
				!compact && "h-7",
				type === "number" && "font-mono tabular-nums",
				className,
			)}
			{...props}
		/>
	);
});

export const NativeSelect = forwardRef<
	HTMLSelectElement,
	ComponentPropsWithoutRef<"select">
>(function NativeSelect(
	{ className, children, size, multiple, ...props },
	ref,
) {
	return (
		<select
			ref={ref}
			data-slot="native-select"
			size={size}
			multiple={multiple}
			className={cn(field, size || multiple ? "py-1" : "h-7", className)}
			{...props}
		>
			{children}
		</select>
	);
});

export const Textarea = forwardRef<
	HTMLTextAreaElement,
	ComponentPropsWithoutRef<"textarea">
>(function Textarea({ className, ...props }, ref) {
	return (
		<textarea
			ref={ref}
			data-slot="textarea"
			className={cn(
				field,
				"min-h-16 resize-y py-1.5 leading-relaxed",
				className,
			)}
			{...props}
		/>
	);
});

// Native range semantics are used by scrubbing, editor shortcuts and form labels.
export const RangeInput = forwardRef<
	HTMLInputElement,
	Omit<ComponentPropsWithoutRef<"input">, "type">
>(function RangeInput({ className, ...props }, ref) {
	return (
		<input
			ref={ref}
			data-slot="slider"
			type="range"
			className={cn(
				"m-0 min-w-0 w-full accent-primary disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
});
