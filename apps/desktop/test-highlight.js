const { codeToHtml } = require('./src/lib/highlight');

async function testHighlight() {
  try {
    console.log('Testing code highlighting...');
    const result = await codeToHtml({
      code: 'function test() { console.log("Hello world"); }',
      lang: 'js',
      theme: 'dark'
    });
    console.log('Success! Highlighted code:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

testHighlight();