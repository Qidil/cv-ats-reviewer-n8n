import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, UploadCloud } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { HistoryPanel } from '@/components/history-panel'
import { api, ApiRequestError } from '@/lib/api'
import { cn } from '@/lib/utils'

const MAX_CV_BYTES = 5 * 1024 * 1024

// Phase 20: gabung step file+mode jadi satu ('select') — Mode A/B tampil
// langsung bersama file picker, tanpa tombol "Lanjut" terpisah.
type Step = 'select' | 'description'

export default function UploadPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('select')
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [jobTitle, setJobTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const dragDepth = useRef(0)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setError(null)
    setCvFile(file)
  }

  function handleDragEnter() {
    dragDepth.current += 1
    setIsDragActive(true)
  }

  function handleDragLeave() {
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setIsDragActive(false)
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    dragDepth.current = 0
    setIsDragActive(false)
    const file = event.dataTransfer.files[0] ?? null
    setError(null)
    setCvFile(file)
  }

  function validateFile(): boolean {
    if (cvFile === null) {
      setError('Pilih file PDF terlebih dahulu.')
      return false
    }
    if (cvFile.type !== 'application/pdf') {
      setError('File harus berupa PDF.')
      return false
    }
    if (cvFile.size > MAX_CV_BYTES) {
      setError('Ukuran file maksimal 5 MB.')
      return false
    }
    return true
  }

  function handleModeSelect(selected: 'A' | 'B') {
    if (!validateFile()) return
    setError(null)
    if (selected === 'A') {
      setStep('description')
      return
    }
    void submitModeB()
  }

  async function submitModeB() {
    if (cvFile === null) {
      setError('Pilih file PDF terlebih dahulu.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      const { id } = await api.uploadCv(cvFile, '')
      navigate(`/matches/${id}`)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Terjadi kesalahan. Silakan coba lagi.')
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const description = jobDescription.trim()
    if (description.length === 0) {
      setError('Deskripsi pekerjaan target wajib diisi untuk Mode A.')
      return
    }
    if (cvFile === null) {
      setError('Pilih file PDF terlebih dahulu.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      const { id } = await api.uploadCv(cvFile, description, jobTitle)
      navigate(`/analysis/${id}`)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Terjadi kesalahan. Silakan coba lagi.')
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-[1120px] gap-6 px-8 py-16 md:grid-cols-2 md:items-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Unggah CV</CardTitle>
          <CardDescription>
            Analisis kecocokan CV Anda terhadap pekerjaan target dengan AI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error !== null && (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>Gagal</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'select' ? (
            <div className="flex flex-col gap-6">
              <div>
                <Label htmlFor="cv-file">File CV (PDF)</Label>
                <div className="mt-3 grid gap-3">
                  <label
                    htmlFor="cv-file"
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-8 py-12 text-center transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      isDragActive
                        ? 'border-primary bg-primary/10 ring-3 ring-primary/20'
                        : 'border-border bg-muted hover:bg-muted/70',
                    )}
                    aria-label="Area unggah CV: klik atau seret file PDF ke sini"
                  >
                    <UploadCloud
                      className={cn(
                        'size-8',
                        isDragActive ? 'text-primary' : 'text-muted-foreground',
                      )}
                      aria-hidden="true"
                    />
                    {isDragActive ? (
                      <span className="text-sm font-medium text-primary">Lepaskan di sini</span>
                    ) : cvFile === null ? (
                      <span className="text-sm text-muted-foreground">
                        Klik atau seret file PDF ke sini (maks 5 MB)
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-foreground">{cvFile.name}</span>
                    )}
                  </label>
                  <Input
                    id="cv-file"
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              <div>
                <Label>Pilih mode analisis</Label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto w-full flex-col items-start gap-1 whitespace-normal p-6 text-left"
                    onClick={() => handleModeSelect('A')}
                    disabled={isSubmitting}
                  >
                    <span className="font-medium">Mode A — Kecocokan Pekerjaan</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Analisis CV terhadap deskripsi pekerjaan target.
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto w-full flex-col items-start gap-1 whitespace-normal p-6 text-left"
                    onClick={() => handleModeSelect('B')}
                    disabled={isSubmitting}
                  >
                    <span className="font-medium">Mode B — Analisis Umum + Saran Pekerjaan</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Skor kualitas CV tanpa JD plus rekomendasi pekerjaan cocok.
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="job-title">Judul pekerjaan target</Label>
                  <Input
                    id="job-title"
                    type="text"
                    placeholder="cth: Senior Frontend Engineer"
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="job-description">Deskripsi pekerjaan target</Label>
                  <Textarea
                    id="job-description"
                    rows={8}
                    placeholder="Tempel deskripsi lowongan pekerjaan di sini…"
                    value={jobDescription}
                    onChange={(event) => setJobDescription(event.target.value)}
                    aria-required="true"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('select')}
                  disabled={isSubmitting}
                >
                  Kembali
                </Button>
                <Button type="submit" disabled={isSubmitting || jobDescription.trim().length === 0}>
                  {isSubmitting ? (
                    'Mengunggah…'
                  ) : (
                    <>
                      Analisis CV
                      <FileUp aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <HistoryPanel />
    </main>
  )
}
