#!/usr/bin/env node

const TOKEN = '58b93c4b47188759d7efe8c7fe4c7177';
const SENDER = 'info@connectvelo.com';

async function testMailtrap() {
  try {
    const { MailtrapClient } = await import('mailtrap');
    const client = new MailtrapClient({ token: TOKEN });
    
    const result = await client.send({
      from: { name: 'ZENGA Test', email: SENDER },
      to: [{ email: 'onecard@gmail.com' }],
      subject: 'Mailtrap Test',
      text: 'If you receive this, Mailtrap is working!',
      html: '<strong>Test email from ZENGA</strong>',
    });
    
    console.log('✅ Email sent successfully!');
    console.log('Response:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Mailtrap error:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
  }
}

testMailtrap();
