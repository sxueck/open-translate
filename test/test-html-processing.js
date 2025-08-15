// Test script for HTML processing functionality
// This script can be run in the browser console to test our HTML handling

// Mock the required constants and utilities
const TEXT_PROCESSING = {
  MIN_TEXT_LENGTH: 3,
  MIN_SIGNIFICANT_LENGTH: 1
};

const REGEX_PATTERNS = {
  PURE_NUMBERS_SYMBOLS: /^[\d\s\W]*$/,
  CHINESE_CHARS: /[\u4e00-\u9fff\u3400-\u4dbf]/
};

// hasSignificantText function is now available from shared/utils.js

// Test HTML processing functions
function testHtmlProcessing() {
  console.log('Testing HTML processing functionality...');
  
  // Test 1: containsHtmlTags
  const testTexts = [
    'Simple text without HTML',
    'Text with <code>HTML tags</code>',
    'Complex <a href="test">link</a> with <strong>formatting</strong>',
    'Text with <span class="copy-to-clipboard">inline elements</span>'
  ];
  
  console.log('\n1. Testing containsHtmlTags:');
  testTexts.forEach(text => {
    const hasHtml = /<[^>]+>/g.test(text);
    console.log(`"${text}" -> ${hasHtml}`);
  });
  
  // Test 2: HTML sanitization
  console.log('\n2. Testing HTML sanitization:');
  const dangerousHtml = '<script>alert("xss")</script><p onclick="alert()">Safe text</p><a href="javascript:alert()">Link</a>';
  console.log('Original:', dangerousHtml);
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = dangerousHtml;
  
  // Remove dangerous elements
  const dangerousElements = tempDiv.querySelectorAll('script, style, iframe, object, embed');
  dangerousElements.forEach(el => el.remove());
  
  // Remove dangerous attributes
  const allElements = tempDiv.querySelectorAll('*');
  allElements.forEach(el => {
    const dangerousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'];
    dangerousAttrs.forEach(attr => {
      if (el.hasAttribute(attr)) {
        el.removeAttribute(attr);
      }
    });
    
    if (el.hasAttribute('href') && el.getAttribute('href').startsWith('javascript:')) {
      el.removeAttribute('href');
    }
  });
  
  console.log('Sanitized:', tempDiv.innerHTML);
  
  // Test 3: Extract text with inline tags
  console.log('\n3. Testing text extraction with inline tags:');
  const htmlContent = 'Text with <code>code</code> and <a href="test">links</a> and <strong>bold</strong> text.';
  console.log('Original HTML:', htmlContent);
  
  const testDiv = document.createElement('div');
  testDiv.innerHTML = htmlContent;
  
  function getTextWithInlineTags(element) {
    let result = '';
    
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        if (['a', 'code', 'span', 'strong', 'em', 'b', 'i', 'u', 'mark', 'sup', 'sub'].includes(tagName)) {
          const innerText = getTextWithInlineTags(node);
          
          if (innerText.trim()) {
            let attrs = '';
            if (node.hasAttribute('href')) {
              attrs += ` href="${node.getAttribute('href')}"`;
            }
            if (node.hasAttribute('class')) {
              attrs += ` class="${node.getAttribute('class')}"`;
            }
            
            result += `<${tagName}${attrs}>${innerText}</${tagName}>`;
          }
        } else {
          result += getTextWithInlineTags(node);
        }
      }
    }
    
    return result;
  }
  
  const extractedText = getTextWithInlineTags(testDiv);
  console.log('Extracted with tags:', extractedText);
  
  // Test 4: Real-world example from the issue
  console.log('\n4. Testing real-world example:');
  const realWorldHtml = `On the surface, this makes the decision to use <code>ipvs</code> an obvious one, however, since <code>iptables</code><span class="copy-to-clipboard" title="Copy to clipboard"></span> have been the default mode for so long, some of its quirks and undocumented side-effects have become the standard.`;
  
  console.log('Real-world HTML:', realWorldHtml);
  
  const realTestDiv = document.createElement('div');
  realTestDiv.innerHTML = realWorldHtml;
  const realExtracted = getTextWithInlineTags(realTestDiv);
  console.log('Extracted:', realExtracted);
  
  console.log('\nHTML processing tests completed!');
}

// Run tests when script is loaded
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', testHtmlProcessing);
  } else {
    testHtmlProcessing();
  }
} else {
  console.log('This script should be run in a browser environment');
}
