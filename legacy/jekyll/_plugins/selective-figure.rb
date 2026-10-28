require 'cgi'

module Jekyll
  module Tags
    class SelectiveFigureTag < Liquid::Block
      FIELD_COUNT = 7

      def initialize(tag_name, markup, tokens)
        super
        @options = {}
        markup.scan(/(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/) do |key, double_quoted, single_quoted, bare|
          @options[key] = double_quoted || single_quoted || bare
        end
      end

      def render(context)
        items = parse_items(super(context))
        rows, columns = parse_grid(items.length)
        variant = @options.fetch('variant', 'grid')
        aria_label = @options.fetch('aria_label', '선택형 이미지')
        link_label = @options['link_label']

        site = context.registers[:site]
        baseurl = site.config.fetch('baseurl', '').to_s
        first = items.first
        preview_tag = first[:href].empty? ? 'figure' : 'a'
        preview_href = first[:href].empty? ? '' : %( href="#{escape(relative_url(first[:href], baseurl))}")
        style = %( style="--hardware-map-columns: #{columns}; --hardware-map-rows: #{rows};")

        tabs = items.each_with_index.map do |item, index|
          active = index.zero?
          row_end = (index + 1) % columns == 0
          href_data = item[:href].empty? ? '' : %( data-href="#{escape(relative_url(item[:href], baseurl))}")
          subtitle = item[:subtitle].empty? ? '' : "<small>#{escape(item[:subtitle])}</small>"

          <<~HTML
            <button class="hardware-map__tab#{' hardware-map__tab--row-end' if row_end}#{' active' if active}" type="button" role="tab"
              aria-selected="#{active}" data-image="#{escape(relative_url(item[:image], baseurl))}"
              data-alt="#{escape(item[:alt])}" data-caption="#{escape(item[:caption])}"#{href_data}>
              <span class="hardware-map__index">#{escape(item[:index])}</span>
              <span>#{escape(item[:title])}#{subtitle}</span>
            </button>
          HTML
        end.join

        link = link_label ? %(<span class="hardware-map__link">#{escape(link_label)}</span>) : ''
        script = ''
        unless context.registers[:selective_figure_script_loaded]
          context.registers[:selective_figure_script_loaded] = true
          script_src = relative_url('/assets/js/hardware-map.js', baseurl)
          script = %(<script src="#{escape(script_src)}" defer></script>)
        end

        <<~HTML
          <div class="hardware-map hardware-map--#{escape(variant)}" data-hardware-map#{style}>
            <div class="hardware-map__tabs" role="tablist" aria-label="#{escape(aria_label)}">
              #{tabs}
            </div>
            <#{preview_tag} class="hardware-map__preview"#{preview_href} aria-live="polite">
              <img src="#{escape(relative_url(first[:image], baseurl))}" alt="#{escape(first[:alt])}">
              <span class="hardware-map__caption">#{escape(first[:caption])}</span>
              #{link}
            </#{preview_tag}>
          </div>
          #{script}
        HTML
      end

      private

      def parse_items(body)
        lines = body.lines.map(&:strip).reject { |line| line.empty? || line.start_with?('#') }
        raise Jekyll::Errors::FatalException, 'selective_figure requires at least one item' if lines.empty?

        lines.map.with_index(1) do |line, line_number|
          fields = line.split('|', -1).map(&:strip)
          unless fields.length == FIELD_COUNT
            raise Jekyll::Errors::FatalException,
                  "selective_figure row #{line_number} must have #{FIELD_COUNT} pipe-separated fields"
          end

          {
            index: fields[0],
            title: fields[1],
            subtitle: fields[2],
            image: fields[3],
            alt: fields[4],
            caption: fields[5],
            href: fields[6]
          }
        end
      end

      def parse_grid(item_count)
        grid = @options['grid']
        unless grid
          columns = @options.fetch('columns', 4).to_i.clamp(1, 12)
          rows = (item_count.to_f / columns).ceil
          return [rows, columns]
        end

        match = grid.match(/\A(\d+)x(\d+)\z/)
        raise Jekyll::Errors::FatalException, 'selective_figure grid must use rowsxcolumns, for example 1x3' unless match

        rows = match[1].to_i
        columns = match[2].to_i
        unless rows.positive? && columns.positive? && rows * columns == item_count
          raise Jekyll::Errors::FatalException,
                "selective_figure grid #{grid} requires #{rows * columns} items, but received #{item_count}"
        end

        [rows, columns]
      end

      def relative_url(path, baseurl)
        return path if path.match?(/\A(?:[a-z]+:)?\/\//i) || path.start_with?('#')

        "#{baseurl}/#{path.sub(%r{\A/+}, '')}".gsub(%r{/+}, '/')
      end

      def escape(value)
        CGI.escapeHTML(value.to_s)
      end
    end
  end
end

Liquid::Template.register_tag('selective_figure', Jekyll::Tags::SelectiveFigureTag)
