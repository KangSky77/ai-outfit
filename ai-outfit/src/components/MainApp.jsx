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

// 목록 상태: status('idle'|'loading'|'error'|'done') + items
const initialList = { status: 'idle', items: [] }

export default function MainApp({ user }) {
  // 로그인 없이도 모든 탭을 쓸 수 있다. 첫 화면은 업로드(분석).
  const [tab, setTab] = useState('upload')
  const [history, setHistory] = useState(initialList)
  const [gallery, setGallery] = useState(initialList)

  // 공통 로더: 로딩/에러 상태까지 관리해서 화면에 보여줄 수 있게 한다.
  const makeLoader = (fetchFn, setState) => async () => {
    setState((s) => ({ ...s, status: 'loading' }))
    try {
      setState({ status: 'done', items: await fetchFn() })
    } catch (e) {
      console.error('목록 로딩 에러:', e)
      setState({ status: 'error', items: [] })
    }
  }

  const loadHistory = useCallback(makeLoader(fetchHistory, setHistory), [])
  const loadGallery = useCallback(makeLoader(fetchPublicGallery, setGallery), [])

  // 탭 전환 시 해당 데이터를 새로 불러온다.
  const switchTab = useCallback((next) => {
    setTab(next)
    if (next === 'history') loadHistory()
    if (next === 'gallery') loadGallery()
  }, [loadHistory, loadGallery])

  // 좋아요 토글: likes 수와 liked 상태를 양쪽 목록에서 갱신 (새로고침 없이)
  // 로그인/익명 모두 가능 (서버가 세션 단위로 중복을 막는다).
  const handleLike = useCallback(async (id) => {
    try {
      const { likes, liked } = await likeOutfit(id)
      const patch = (s) => ({ ...s, items: s.items.map((it) => (it.id === id ? { ...it, likes, liked } : it)) })
      setHistory(patch)
      setGallery(patch)
    } catch (e) { console.error('좋아요 에러:', e) }
  }, [])

  // 삭제: 확인 후 양쪽 목록에서 제거 (로그인/익명 모두 자기 것만)
  const handleDelete = useCallback(async (id) => {
    if (!window.confirm(dict.deleteConfirm)) return
    try {
      await deleteOutfit(id)
      const remove = (s) => ({ ...s, items: s.items.filter((it) => it.id !== id) })
      setHistory(remove)
      setGallery(remove)
    } catch (e) { console.error('삭제 에러:', e) }
  }, [user])

  return (
    <>
      <Header tab={tab} onSwitch={switchTab} user={user} />

      {tab === 'upload' && <UploadTab onAnalyzed={loadHistory} user={user} />}
      {tab === 'history' && (
        <HistoryTab data={history} onLike={handleLike} onDelete={handleDelete} />
      )}
      {tab === 'gallery' && <GalleryTab data={gallery} onLike={handleLike} />}

      <BottomNav tab={tab} onSwitch={switchTab} />
    </>
  )
}
