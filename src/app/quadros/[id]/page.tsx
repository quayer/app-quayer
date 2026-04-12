'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { api } from '@/igniter.client'
import { ArrowLeft, Save, Check, Loader2 } from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import Link from 'next/link'

const Excalidraw = dynamic(
  () => import('@excalidraw/excalidraw').then((mod) => ({ default: mod.Excalidraw })),
  { ssr: false }
)

type SaveStatus = 'idle' | 'saving' | 'saved'

export default function BoardEditorPage() {
  const params = useParams()
  const boardId = params.id as string

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedRef = useRef<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['board', boardId],
    queryFn: async () => {
      const response = await (api.boards.get as any).query({
        params: { id: boardId },
      })
      return response
    },
    enabled: !!boardId,
  })

  const updateMutation = useMutation({
    mutationFn: async (sceneData: any) => {
      await (api.boards.update as any).mutate({
        params: { id: boardId },
        body: { data: sceneData },
      })
    },
    onSuccess: () => {
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    },
    onError: () => {
      setSaveStatus('idle')
    },
  })

  const board = (data as any)?.data

  const saveBoard = useCallback(
    (elements: any[], appState: any, files: any) => {
      if (!boardId) return

      const sceneData = {
        elements,
        appState: { ...appState, collaborators: [] },
        files,
      }
      const serialized = JSON.stringify(sceneData)

      if (serialized === lastSavedRef.current) return
      lastSavedRef.current = serialized

      setSaveStatus('saving')
      updateMutation.mutate(sceneData)
    },
    [boardId, updateMutation]
  )

  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveBoard([...elements], appState, files)
      }, 2000)
    },
    [saveBoard]
  )

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground">Quadro não encontrado</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/quadros">Voltar</Link>
        </Button>
      </div>
    )
  }

  const initialData =
    board.data && typeof board.data === 'object' && Object.keys(board.data).length > 0
      ? board.data
      : { elements: [], appState: {}, files: {} }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href="/quadros">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-sm font-medium truncate max-w-[300px]">
            {board.name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Salvando...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Salvo
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={() => {
              if (excalidrawAPI) {
                const elements = excalidrawAPI.getSceneElements()
                const appState = excalidrawAPI.getAppState()
                const files = excalidrawAPI.getFiles()
                saveBoard(elements, appState, files)
              }
            }}
          >
            <Save className="h-3 w-3" />
            Salvar
          </Button>
        </div>
      </div>

      {/* Excalidraw Canvas */}
      <div className="flex-1">
        <Excalidraw
          excalidrawAPI={(api: any) => setExcalidrawAPI(api)}
          initialData={initialData}
          onChange={handleChange}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              loadScene: false,
              export: { saveFileToDisk: true },
            },
          }}
          langCode="pt-BR"
        />
      </div>
    </div>
  )
}
