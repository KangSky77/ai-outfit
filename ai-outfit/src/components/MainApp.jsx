import { useState, useCallback } from 'react'
import { dict } from '../i18n.js'
import Header from './Header.jsx'
import BottomNav from './BottomNav.jsx'
import UploadTab from './UploadTab.jsx'
import HistoryTab from './HistoryTab.jsx'
import GalleryTab from './GalleryTab.jsx'
import {
  fetchHistory, fetchPublicGallery, likeOutfit, deleteOutfit,
} from '../api.js'

export default function MainApp() {
  const [tab, setTab] = useState('upload')
  const [history, setHistory] = useState([])
  const [gallery, setGallery] = useState([])

  const loadHistory = useCallback(async () => {
    try { setHistory(await fetchHistory()) }
    catch (e) { console.error('기록 로딩 에러:', e) }
  }, [])

  const loadGallery = useCallback(async () => {
    try { setGallery(await fetchPublicGallery()) }
    catch (e) { console.error('갤러리 로딩 에러:', e) }
  }, [])

  // 탭 전환 시 해당 데이터를 새로 불러온다.
  const switchTab = useCallback((next) => {
    setTab(next)
    if (next === 'history') loadHistory()
    if (next === 'gallery') loadGallery()
  }, [loadHistory, loadGallery])

  // 좋아요: 기록/갤러리 양쪽에서 해당 항목의 likes 를 갱신 (새로고침 없이)
  const handleLike = useCallback(async (id) => {
    try {
      const { likes } = await likeOutfit(id)
      const patch = (arr) => arr.map((it) => (it.id === id ? { ...it, likes } : it))
      setHistory(patch)
      setGallery(patch)
    } catch (e) { console.error('좋아요 에러:', e) }
  }, [])

  // 삭제: 확인 후 양쪽 목록에서 제거
  const handleDelete = useCallback(async (id) => {
    if (!window.confirm(dict.deleteConfirm)) return
    try {
      await deleteOutfit(id)
      const remove = (arr) => arr.filter((it) => it.id !== id)
      setHistory(remove)
      setGallery(remove)
    } catch (e) { console.error('삭제 에러:', e) }
  }, [])

  return (
    <>
      <Header tab={tab} onSwitch={switchTab} />

      {tab === 'upload' && <UploadTab onAnalyzed={loadHistory} />}
      {tab === 'history' && (
        <HistoryTab items={history} onLike={handleLike} onDelete={handleDelete} />
      )}
      {tab === 'gallery' && <GalleryTab items={gallery} onLike={handleLike} />}

      <BottomNav tab={tab} onSwitch={switchTab} />
    </>
  )
}
