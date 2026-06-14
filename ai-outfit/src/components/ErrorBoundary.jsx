import { Component } from 'react'

// 렌더링 중 예외가 나도 흰 화면 대신 안내 화면을 보여준다.
export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('렌더링 에러:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-screen">
          <p>😵 문제가 발생했어요.</p>
          <button className="btn-analyze" onClick={() => window.location.reload()}>
            새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
