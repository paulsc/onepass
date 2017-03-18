#include <gtk/gtk.h>
#include <stdlib.h>

void menu_hide(GtkWidget *widget, gpointer user_data) {
    gtk_main_quit();
}

void menu_item_clicked(GtkWidget *widget, gpointer user_data) {
    int *index = (int *)user_data;
    printf("%d", *index);
    gtk_main_quit();
}

void add_menu_item(GtkWidget *menu, const char *label, int *idx) {
    GtkWidget *item = gtk_menu_item_new_with_label(label);

    g_signal_connect(G_OBJECT(item), "activate", G_CALLBACK(menu_item_clicked), idx); 

    gtk_widget_show(item);
    gtk_menu_append(menu, item);
}

int main(int argc, char *argv[]) {
    gtk_init(NULL, NULL);

    GtkWidget *menu = gtk_menu_new();

    g_signal_connect(G_OBJECT(menu), "hide", G_CALLBACK(menu_hide), NULL); 

    if (argc <= 1) {
        printf("Please specify menu items.\n");
        return 1;
    }

    int indices[argc - 1];
    for (int i = 1; i < argc; i++) {
        indices[i] = i - 1;
    }

    for (int i = 1; i < argc; i++) {
        add_menu_item(menu, argv[i], &indices[i]);
    }

    gtk_menu_popup((GtkMenu *)menu, NULL, NULL, NULL, NULL, 0, gtk_get_current_event_time());

    gtk_main();
}


