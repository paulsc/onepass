#!/bin/sh
gcc $(pkg-config --libs --cflags gtk+-2.0) gtkmenu.c -o gtkmenu
