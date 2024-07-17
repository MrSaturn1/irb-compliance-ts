import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
  const formData = await request.formData();
  
  try {
    // Forward the request to your Express backend
    const response = await axios.post('http://localhost:3001/api/add-document', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return NextResponse.json({ message: 'Documents added successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error adding documents:', error);
    return NextResponse.json({ error: 'Failed to add documents' }, { status: 500 });
  }
}