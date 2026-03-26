'use client'

import { useParams } from 'next/navigation'
import BookingPage from '@/components/BookingPage'

export default function ReschedulePage() {
  const params = useParams()
  const rescheduleToken = params.token as string
  return <BookingPage rescheduleToken={rescheduleToken} />
}
