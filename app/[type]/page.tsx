'use client'

import { useParams } from 'next/navigation'
import BookingPage from '@/components/BookingPage'

export default function TypePage() {
  const params = useParams()
  const type = params.type as string
  return <BookingPage filterType={type} />
}
