import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error boundary:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '1.5rem',
            background: '#faf8f5',
            color: '#2a211c',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 360 }}>
            <h1 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
              Diçka shkoi keq
            </h1>
            <p style={{ color: '#6a5a4c', marginBottom: '1.25rem', lineHeight: 1.45 }}>
              Rifresko faqen. Nëse vazhdon, dil dhe hyr përsëri.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                minHeight: 48,
                padding: '0.75rem 1.25rem',
                borderRadius: 8,
                border: 'none',
                background: '#2a211c',
                color: '#faf8f5',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Rifresko
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
