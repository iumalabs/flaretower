import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { EmptyState } from "./EmptyState.tsx";

interface PageErrorBoundaryProps {
  children: ReactNode;
}

interface PageErrorBoundaryState {
  error: Error | null;
}

// React error boundaries must be class components — there is no hook
// equivalent. App.tsx wraps only the active page's content with this
// (keyed on the page, so switching pages remounts and clears any prior
// error), not the whole app including Sidebar — without it, a render-time
// exception in any single page (as opposed to a caught fetch failure,
// which every page already handles inline) unmounts the entire React
// tree, blanking the whole control panel rather than degrading to just
// the one broken page. For a tool reached for during incident response,
// losing the ability to even navigate to a working page over one bad
// render is a real reliability gap, not a cosmetic one.
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  override state: PageErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Page failed to render:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <EmptyState
          heading="This page failed to render"
          description={this.state.error.message || "An unexpected error occurred."}
          ctaLabel="Reload"
          onCta={() => globalThis.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
