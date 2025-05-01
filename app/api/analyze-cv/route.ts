import { NextRequest, NextResponse } from 'next/server';

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file || !(file instanceof File)) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid file upload' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Basic validation
    if (file.type !== 'application/pdf') {
      return new NextResponse(
        JSON.stringify({ error: 'Only PDF files are supported' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return new NextResponse(
        JSON.stringify({ error: 'File size must be less than 10MB' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Return success response - actual parsing will happen on client side
    return new NextResponse(
      JSON.stringify({ 
        success: true,
        message: 'File received successfully'
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new NextResponse(
      JSON.stringify({ error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 