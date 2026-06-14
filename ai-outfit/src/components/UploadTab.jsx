import { useState } from 'react'
import { dict } from '../i18n.js'
import { analyzeOutfit, getUserLocation } from '../api.js'
import AnalysisResult from './AnalysisResult.jsx'
import ShareButton from './ShareButton.jsx'

export default function UploadTab({ onAnalyzed }) {
  const [file, setFile] = useState(null)
  const [isPublic, setIsPublic] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { text } 또는 { error }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file || loading) return

    setLoading(true)
    setResult(null)
    try {
      const coords = await getUserLocation() // 날씨용 위치 (거부 시 null)
      const data = await analyzeOutfit(file, { coords, isPublic })
      if (data.error) {
        setResult({ error: `${dict.errorPrefix}: ${data.error}` })
      } else {
        setResult({ text: data.analysis })
        onAnalyzed?.() // 기록 갱신
      }
    } catch (err) {
      console.error(err)
      setResult({ error: dict.networkError })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="tab-content">
      <div className="upload-section">
        <h1>{dict.uploadTitle}</h1>
        <p className="upload-desc">{dict.uploadDesc}</p>

        <form onSubmit={handleSubmit}>
          <input
            type="file"
            id="imageInput"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
          <label htmlFor="imageInput">
            <div className="upload-card">
              <div className="camera-icon-circle">
                <span className="material-symbols-outlined">add_a_photo</span>
              </div>
              <h3>{file ? `✅ ${dict.selected}` : dict.uploadTitle}</h3>
              <p>{dict.uploadDesc}</p>
            </div>
          </label>

          <div className="public-check-row">
            <label>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />{' '}
              <span>{dict.publicCheck}</span>
            </label>
          </div>

          {file && (
            <div>
              <button type="submit" className="btn-analyze" disabled={loading}>
                {dict.analyzeBtn}
              </button>
            </div>
          )}
        </form>

        {loading && <div className="loading-spinner">{dict.loading}</div>}

        {result && (
          <div className={`result-card ${result.error ? 'error' : ''}`}>
            <h4>{dict.resultLabel}</h4>
            {result.error ? result.error : (
              <>
                <AnalysisResult text={result.text} />
                <ShareButton text={result.text} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
