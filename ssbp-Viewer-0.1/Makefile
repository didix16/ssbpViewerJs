CC=gcc
CFLAGS=-I.

ODIR=obj
LIBS= -lstdc++ -ldl -lm -lglad -lglfw -lwebp

DEPS = 
OBJ = $(addprefix $(ODIR)/, ssplayer_matrix.o ssplayer_effect.o ssplayer_effectfunction.o \
ssplayer_PartState.o sprite.o texture.o shader.o directory.o SS5Player.o SS5PlayerPlatform.o DebugPrint.o )
MAIN = main.cpp

#$(ODIR)/%.o: %.c $(DEPS)
#	$(CC) -c -o $@ $< $(CFLAGS)

all: ssbp_viewer

$(ODIR):
	mkdir $(ODIR)

$(ODIR)/DebugPrint.o: ssbp/common/Helper/DebugPrint.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

$(ODIR)/SS5Player.o: ssbp/SS5Player.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

$(ODIR)/SS5PlayerPlatform.o: ssbp/SS5PlayerPlatform.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

$(ODIR)/sprite.o: sprite.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

$(ODIR)/directory.o: directory.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

$(ODIR)/texture.o: texture.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

$(ODIR)/shader.o: shader.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

$(ODIR)/ssplayer_PartState.o: ssbp/common/Animator/ssplayer_PartState.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

$(ODIR)/ssplayer_effectfunction.o: ssbp/common/Animator/ssplayer_effectfunction.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

$(ODIR)/ssplayer_effect.o: ssbp/common/Animator/ssplayer_effect.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

$(ODIR)/ssplayer_matrix.o: ssbp/common/Animator/ssplayer_matrix.cpp
	$(CC) -c -o $@ $^ $(CFLAGS) $(LIBS)

ssbp_viewer: $(ODIR) $(OBJ)
	$(CC) -o $@ $(OBJ) $(MAIN) $(CFLAGS) $(LIBS)

.PHONY: clean

clean:
	rm -f $(ODIR)/*.o
	rm -Rf $(ODIR)