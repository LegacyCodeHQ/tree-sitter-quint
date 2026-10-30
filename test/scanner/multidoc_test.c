#define main reuse_contract_main
#include "reuse_test.c"
#undef main

int main(void) {
  char complete[10][32768], incomplete[10][32768], edited[32832];
  for (unsigned i=0;i<10;i++) {
    size_t length=(size_t)snprintf(complete[i],sizeof(complete[i]),"module Editor%u {\n",i);
    for(unsigned n=0;n<512+i;n++) length+=(size_t)snprintf(complete[i]+length,sizeof(complete[i])-length,
      "pure val value%u = %u + 1\n",n,n);
    length+=(size_t)snprintf(complete[i]+length,sizeof(complete[i])-length,"}\n");
    assert(length<sizeof(complete[i]));
    memcpy(incomplete[i],complete[i],length+1);incomplete[i][length-2]=' ';
  }
  const unsigned sizes[]={2,4,10};
  for(size_t group=0;group<3;group++) {
    unsigned count=sizes[group];
    for(unsigned i=0;i<count;i++) {parse(complete[i],false);parse(incomplete[i],true);}
    size_t hits=0,misses=0;
    for(unsigned round=0;round<3;round++) for(unsigned i=0;i<count;i++) for(unsigned error=0;error<2;error++) {
      snprintf(edited,sizeof(edited),"/* visit %u */\n%s",round,error?incomplete[i]:complete[i]);
#ifdef Q_RECOGNITION_CACHE_ENABLED
      QDocument probe={0};assert(q_tokenize(&probe,edited,strlen(edited)));
      int cached=q_cached_boundaries(&probe);assert(cached>=0);
      if(cached) hits++;else misses++;
      q_document_destroy(&probe);assert(live==0);
#endif
      calls=requested=0;parse(edited,error);
      fprintf(stderr,"%u documents, round %u, document %u, error %u: %zu scanner allocations\n",count,round,i,error,calls);
#ifdef Q_RECOGNITION_CACHE_ENABLED
      assert(calls<64);
#endif
    }
    fprintf(stderr,"%u interleaved documents: %zu cache hits, %zu misses\n",count,hits,misses);
#ifdef Q_RECOGNITION_CACHE_ENABLED
    assert(hits==count*6 && misses==0);
#endif
  }
  return 0;
}
