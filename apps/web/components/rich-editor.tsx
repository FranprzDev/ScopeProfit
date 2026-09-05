'use client';
import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import type { TiptapNode } from '@scopeprofit/contracts';
export function RichEditor({content,onChange,label,full=false}:{content:TiptapNode;onChange:(value:TiptapNode)=>void;label:string;full?:boolean}){
 const editor=useEditor({extensions:[StarterKit.configure({link:false,codeBlock:false,horizontalRule:false,blockquote:false,strike:false}),...(full?[TableKit]:[])],content,immediatelyRender:false,onUpdate:({editor})=>onChange(editor.getJSON() as TiptapNode),editorProps:{attributes:{'aria-label':label,role:'textbox','aria-multiline':'true',class:'rich-content'}}});
 useEffect(()=>{if(editor&&JSON.stringify(editor.getJSON())!==JSON.stringify(content))editor.commands.setContent(content,{emitUpdate:false});},[content,editor]);
 return <div className="rich-editor"><div className="editor-toolbar" role="toolbar" aria-label="Formato del texto"><button type="button" aria-label="Negrita" aria-pressed={editor?.isActive('bold')??false} onClick={()=>editor?.chain().focus().toggleBold().run()}><strong>B</strong></button><button type="button" aria-label="Cursiva" aria-pressed={editor?.isActive('italic')??false} onClick={()=>editor?.chain().focus().toggleItalic().run()}><em>I</em></button>{full&&<><button type="button" onClick={()=>editor?.chain().focus().toggleHeading({level:2}).run()}>Título</button><button type="button" onClick={()=>editor?.chain().focus().toggleBulletList().run()}>Lista</button><button type="button" onClick={()=>editor?.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()}>Tabla</button><button type="button" onClick={()=>editor?.chain().focus().deleteTable().run()}>Quitar tabla</button></>}</div><EditorContent editor={editor}/></div>;
}
