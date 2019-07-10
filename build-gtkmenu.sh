#!/bin/sh
gcc gtkmenu.c -o gtkmenu $(pkg-config --libs --cflags gtk+-2.0)
