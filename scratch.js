const text = '*123*';
let html = text.replace(/\*([^\*\n]+)\*/g, '<strong>$1</strong>');
console.log(html);
