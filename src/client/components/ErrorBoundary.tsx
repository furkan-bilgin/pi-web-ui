import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex h-full items-center justify-center p-8">
            <div className="rounded-lg border border-red-400/30 bg-red-50/10 px-6 py-4 text-center">
              <p className="text-sm font-medium text-red-400">Something went wrong</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {this.state.error?.message || "Unknown error"}
              </p>
              <button
                className="mt-3 rounded bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
