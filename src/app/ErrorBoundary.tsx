import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/Panel";
import styles from "./App.module.css";

interface Props {
  area: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Contains a crash to one workspace. The project data lives in the store, so
 * resetting the view does not lose work; the error is shown and logged.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`The ${this.props.area} workspace crashed`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={styles.crash} role="alert">
        <EmptyState
          icon="error"
          title={`The ${this.props.area} workspace stopped because of an error`}
          actions={
            <Button variant="primary" onClick={() => this.setState({ error: null })}>
              Reload workspace
            </Button>
          }
        >
          <p>Your project is still open. Save it before trying again.</p>
          <pre className={styles.crashDetail}>{this.state.error.message}</pre>
        </EmptyState>
      </div>
    );
  }
}
