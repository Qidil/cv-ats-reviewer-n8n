import { AlertCircle, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

// Phase 18 (MIN-14): the "ID tidak valid" / generic-error alert + back-button
// block was duplicated near-identically across analysis/matches/approval/result.
interface RouteErrorStateProps {
  title: string
  description: string
  backTo?: string
  backLabel?: string
}

export function RouteErrorState({
  title,
  description,
  backTo = '/',
  backLabel = 'Kembali',
}: RouteErrorStateProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center px-8 py-16">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
      <div className="mt-6">
        <Button asChild variant="outline">
          <Link to={backTo}>
            <ArrowLeft aria-hidden="true" />
            {backLabel}
          </Link>
        </Button>
      </div>
    </main>
  )
}
