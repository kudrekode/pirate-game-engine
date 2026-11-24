import {
	createContext,
	type MutableRefObject,
	type ReactNode,
	useEffect,
	useRef,
} from "react";
import type { WebGLRenderer } from "three";

export const CinematicRendererContext = createContext<MutableRefObject<
	WebGLRenderer | undefined
> | null>(null);

export function CinematicRendererOwner({ children }: { children: ReactNode }) {
	const ref = useOwnedThreeRenderer();
	return (
		<CinematicRendererContext.Provider value={ref}>
			{children}
		</CinematicRendererContext.Provider>
	);
}

export function useOwnedThreeRenderer() {
	const ref = useRef<WebGLRenderer | undefined>(undefined);
	useEffect(
		() => () => {
			ref.current?.dispose();
			ref.current?.forceContextLoss?.();
			ref.current = undefined;
		},
		[],
	);
	return ref;
}
