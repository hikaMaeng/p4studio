import struct,json,sys
f=open(sys.argv[1],'rb')
def unpack(fmt): return struct.unpack('<'+fmt,f.read(struct.calcsize('<'+fmt)))[0]
def string(): return f.read(unpack('Q')).decode('utf8')
def value(t):
    if t==8:return string()
    if t==9:
        element=unpack('I');n=unpack('Q')
        for _ in range(n):value(element)
        return {'array_length':n}
    return unpack({0:'B',1:'b',2:'H',3:'h',4:'I',5:'i',6:'f',7:'?',10:'Q',11:'q',12:'d'}[t])
assert f.read(4)==b'GGUF'
version=unpack('I');tensors=unpack('Q');count=unpack('Q');out={'version':version,'tensors':tensors}
for _ in range(count):
    key=string();v=value(unpack('I'))
    if key in ['general.name','general.architecture','tokenizer.chat_template'] or key.endswith('.block_count'):out[key]=v
print(json.dumps(out,ensure_ascii=False,indent=2))
